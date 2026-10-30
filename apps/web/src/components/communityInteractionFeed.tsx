import { Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CommunityAgentIcon, useCommunityAgentName } from "../../../../shared/CommunityAgentIcon";
import { CommunityChannelSessionContext } from "./CommunityChannelSessionContext";
import { downloadCloudCommunityChatAttachment } from "../../../../shared/cloudCommunityChatGateway";
import {
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { EmojiPickerButton, QUICK_REACTIONS, ReactionSummary } from "./communityInteractionRowParts";
import { PostCardView } from "./CommunityPostCard";
import { MessageLinkMedia } from "./MessageLinkMedia";
import { PdfDocumentCard } from "./PdfDocumentCard";
import { confirmInPage, toastInPage } from "./confirmInPage";
import { useProtectedImage } from "./protectedImageStore";
import { isPdfDocument, safeDocumentUrl } from "../../../../shared/messagePdf";
import { groupInteractionFeed } from "./groupInteractionFeed";
import { MemberAvatarStack, type MemberAvatarStackFace } from "./MemberAvatarStack";
import type { WebCommunityInteractionProjectionProps } from "./WebCommunityInteractionProjection";
import type {
  CommunityInteractionAttachment,
  CommunityInteractionContentBlock,
  CommunityInteractionMention,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import {
  splitBodyIntoMentionSegments,
  type ResolvedMentionForRendering,
} from "../../../../shared/communityMentionRendering";
import { ChatBlockMarkdown } from "../../../../shared/chatBlockMarkdownUi";
import { tokenizeChatContactText } from "../../../../shared/chatContactText";
import { renderChatInlineMarkdown } from "../../../../shared/chatInlineMarkdownUi";
import { partitionCommunityAttachments } from "../../../../shared/communityAttachmentUi";
import { CommunityChatMediaGrid, type CommunityChatMediaImage } from "../../../../shared/CommunityChatMediaGrid";
import { CommunityChatMediaPlayers } from "../../../../shared/CommunityChatMediaPlayers";
import type { CommunityTypingPresenceUser, UserProfile } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { interactionMentionsViewer } from "../controllers/communityMentionAttention";
import { resolveCommunityInteractionOverflowMenuPlacement } from "../controllers/resolveCommunityInteractionOverflowMenuPlacement";

export function actorLabel(
  actor: {
    actor_type: string;
    actor_user_id: string | null;
    actor_agent_key: string | null;
    on_behalf_of_user_id?: string | null;
  },
  displayName: (userId: string) => string,
  communityAgentDisplayName?: string,
): string {
  if (actor.actor_type === "community_agent") {
    const agent = String(communityAgentDisplayName ?? "").trim() || "Community agent";
    return actor.on_behalf_of_user_id ? `${agent} · for ${displayName(actor.on_behalf_of_user_id)}` : agent;
  }
  if (actor.actor_user_id) return displayName(actor.actor_user_id);
  if (actor.actor_agent_key) return actor.actor_agent_key.replace(/_/g, " ");
  if (actor.actor_type === "system") return "System";
  return "Member";
}

export function kindChipLabel(kind: string): string | null {
  if (kind === "discussion") return null;
  if (kind === "resource_share") return "Resource";
  if (kind === "agent_signal") return "Agent signal";
  if (kind === "announcement") return "Announcement";
  if (kind === "question") return "Question";
  return (
    kind
      .split("_")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ") || null
  );
}

export function agentBadgeLabel(actorType: string): string | null {
  if (actorType === "community_agent") return "Agent";
  return null;
}

export function sortedBlocks(blocks: CommunityInteractionContentBlock[]): CommunityInteractionContentBlock[] {
  return [...blocks].sort((left, right) => left.block_order - right.block_order);
}

export function blockText(block: CommunityInteractionContentBlock): string {
  if (block.block_type === "markdown_text") return String(block.text ?? "").trim();
  if (block.block_type === "link") return String(block.text ?? block.url ?? "").trim();
  if (block.block_type === "workspace_ref") {
    const kind = String(block.workspace_ref_kind ?? "workspace").trim();
    const id = String(block.workspace_ref_id ?? "").trim();
    return [kind, id].filter(Boolean).join(": ");
  }
  if (block.block_type === "mention") {
    if (block.mentioned_user_id) return `@${block.mentioned_user_id}`;
    if (block.mentioned_agent_key) return `@${block.mentioned_agent_key}`;
    if (block.mentioned_role_key) return `@${block.mentioned_role_key}`;
  }
  return String(block.text ?? "").trim();
}

export function bundleText(blocks: CommunityInteractionContentBlock[], fallback: string): string {
  const orderedBlocks = sortedBlocks(blocks);
  const hasCanonicalMessageText = orderedBlocks.some(
    (block) => block.block_type === "markdown_text" && Boolean(blockText(block)),
  );
  const displayBlocks = hasCanonicalMessageText
    ? orderedBlocks.filter((block) => block.block_type !== "link")
    : orderedBlocks;
  const text = displayBlocks
    .map(blockText)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || fallback;
}

// An attachment-only post stores a "Shared attachment: name" summary line. The real attachment
// renders, so drop that redundant line from the displayed body.
export function stripSharedAttachmentSummary(text: string, hasAttachments: boolean): string {
  if (!hasAttachments) return text;
  return text
    .split(/\n{2,}/)
    .filter((part) => !/^shared attachments?:/i.test(part.trim()))
    .join("\n\n")
    .trim();
}

export function OverflowMenu(props: {
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  // Inside an invite-only channel the pin belongs to the pod.
  pinPlace?: "channel" | "pod";
}) {
  const [open, setOpen] = useState(false);
  const pinPlace = props.pinPlace ?? "channel";
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPlacement(
      resolveCommunityInteractionOverflowMenuPlacement(
        trigger.getBoundingClientRect(),
        window.innerHeight,
      ),
    );
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    updatePlacement();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);
  if (!props.onEdit && !props.onDelete && !props.onPin) return null;
  return (
    <div className="community-interaction-emoji-picker" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="community-interaction-msg-action"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        onClick={() => {
          if (!open) updatePlacement();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={`community-interaction-overflow-menu is-${placement}`}
          data-placement={placement}
          role="menu"
        >
          {props.onPin ? (
            <button
              type="button"
              className="community-interaction-overflow-item"
              onClick={() => {
                props.onPin?.();
                setOpen(false);
              }}
            >
              {props.isPinned
                ? <><PinOff size={14} aria-hidden="true" /> Unpin from {pinPlace}</>
                : <><Pin size={14} aria-hidden="true" /> Pin to {pinPlace}</>}
            </button>
          ) : null}
          {props.onEdit ? (
            <button
              type="button"
              className="community-interaction-overflow-item"
              onClick={() => {
                props.onEdit?.();
                setOpen(false);
              }}
            >
              <Pencil size={14} aria-hidden="true" /> Edit
            </button>
          ) : null}
          {props.onDelete ? (
            <button
              type="button"
              className="community-interaction-overflow-item is-danger"
              onClick={() => {
                props.onDelete?.();
                setOpen(false);
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EditForm(props: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="community-interaction-edit">
      <textarea
        className="community-interaction-edit-input"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.onSave();
          } else if (event.key === "Escape") {
            event.preventDefault();
            props.onCancel();
          }
        }}
        rows={2}
        autoFocus
      />
      <div className="community-interaction-edit-actions">
        <button type="button" className="community-interaction-edit-cancel" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" className="community-interaction-edit-save" onClick={props.onSave}>
          Save
        </button>
      </div>
    </div>
  );
}

export function MessageActions(props: {
  onReact: (emoji: string) => void;
  onReply?: () => void;
  replyLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  pinPlace?: "channel" | "pod";
}) {
  return (
    <div className="community-interaction-msg-actions">
      {/* Reply leads, with its name on it, so a thread is one obvious click. */}
      {props.onReply ? (
        <button
          type="button"
          className="community-interaction-msg-action community-interaction-msg-reply"
          onClick={props.onReply}
          aria-label={props.replyLabel}
          title={props.replyLabel}
        >
          <MessageSquare size={15} aria-hidden="true" />
          <span aria-hidden="true">Reply</span>
        </button>
      ) : null}
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="community-interaction-msg-action community-interaction-msg-emoji"
          onClick={() => props.onReact(emoji)}
          aria-label={`React with ${emoji}`}
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <EmojiPickerButton
        className="community-interaction-msg-action"
        label="Add reaction"
        onPick={props.onReact}
      />
      <OverflowMenu
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        onPin={props.onPin}
        isPinned={props.isPinned}
        pinPlace={props.pinPlace}
      />
    </div>
  );
}

export function formatRelativeTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function ActorAvatar(props: {
  label: string;
  seed: string;
  profile?: UserProfile | null;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  className?: string;
  online?: boolean;
}) {
  // The community agent (seed is its canonical agent key) wears its
  // community's icon (Sparkles when it has none) everywhere an avatar renders —
  // never person initials. One chokepoint so no render path is missed.
  if (props.seed === "community_agent") {
    return (
      <span
        className={`${props.className ?? "community-interaction-avatar"} is-agent-avatar`}
        aria-hidden="true"
      >
        <CommunityAgentIcon />
      </span>
    );
  }
  const avatar = (
    <UserAvatar
      className={props.className ?? "community-interaction-avatar"}
      readyClassName="has-image"
      imageClassName="community-interaction-avatar-image"
      fallbackClassName="community-interaction-avatar-fallback"
      name={props.label}
      imageUrl={props.profile?.avatar_url}
      focusX={props.profile?.avatar_focus_x ?? 0.5}
      focusY={props.profile?.avatar_focus_y ?? 0.5}
      zoom={props.profile?.avatar_zoom ?? 1}
      fallback={<span>{props.getInitials(props.label)}</span>}
      fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed || props.label) }}
      alt=""
      aria-hidden={true}
    />
  );
  if (!props.online) return avatar;
  return (
    <span className="community-interaction-avatar-presence">
      {avatar}
      <span className="community-interaction-online-dot" aria-label="Online" />
    </span>
  );
}

export function ProfileHoverCard(props: {
  userId: string | null;
  label: string;
  seed: string;
  profile?: UserProfile | null;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  className?: string;
  currentUserId?: string | null;
  onOpenProfile?: (userId: string) => void;
  onMessageUser?: (userId: string) => void;
  children?: ReactNode;
  triggerClassName?: string;
  online?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");
  const userId = props.userId;

  const clearClose = () => {
    if (closeTimer.current === null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const clearOpen = () => {
    if (openTimer.current === null) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  const resolvePlacement = (): "top" | "bottom" => {
    const anchor = anchorRef.current;
    if (!anchor) return "top";
    const rect = anchor.getBoundingClientRect();
    const viewport = anchor.closest(
      ".community-interaction-feed-scroll, .community-interaction-drawer-scroll",
    );
    const vRect = viewport instanceof HTMLElement ? viewport.getBoundingClientRect() : null;
    const top = Math.max(0, vRect?.top ?? 0);
    const bottom = Math.min(window.innerHeight, vRect?.bottom ?? window.innerHeight);
    const cardHeight = Math.min(cardRef.current?.getBoundingClientRect().height || 188, 188);
    const required = cardHeight + 10;
    const spaceAbove = rect.top - top;
    const spaceBelow = bottom - rect.bottom;
    return spaceAbove < required && spaceBelow > spaceAbove ? "bottom" : "top";
  };
  const openHover = () => {
    if (!userId) return;
    clearClose();
    if (open || openTimer.current !== null) return;
    // Hover-intent delay so the card doesn't fire while sweeping past names/avatars.
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setPlacement(resolvePlacement());
      setOpen(true);
    }, 450);
  };
  const scheduleClose = () => {
    clearOpen();
    clearClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 140);
  };
  useEffect(() => () => {
    clearOpen();
    clearClose();
  }, []);

  const trigger = props.children ?? (
    <ActorAvatar
      label={props.label}
      seed={props.seed}
      profile={props.profile}
      getAvatarColor={props.getAvatarColor}
      getInitials={props.getInitials}
      className={props.className}
      online={props.online}
    />
  );
  if (!userId) return <>{trigger}</>;

  const handle = props.profile?.handle?.trim() || null;
  const handleLabel = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : null;
  const bio = props.profile?.bio?.trim() || "";
  const canMessage = Boolean(props.onMessageUser) && userId !== props.currentUserId;

  return (
    <span
      className="community-interaction-avatar-hover"
      ref={anchorRef}
      onMouseEnter={openHover}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={props.triggerClassName ?? "community-interaction-avatar-trigger"}
        onClick={() => props.onOpenProfile?.(userId)}
        aria-label={`${props.label} profile`}
      >
        {trigger}
      </button>
      <div
        ref={cardRef}
        className={`chat-profile-hover-card${open ? " is-open" : ""}`}
        data-placement={placement}
        role="group"
        aria-label={`${props.label} profile preview`}
        onMouseEnter={openHover}
        onMouseLeave={scheduleClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clearClose();
            setOpen(false);
          }
        }}
      >
        <div className="chat-profile-hover-top">
          <UserAvatar
            className="chat-profile-hover-avatar"
            readyClassName="has-image"
            name={props.label}
            imageUrl={props.profile?.avatar_url ?? null}
            focusX={props.profile?.avatar_focus_x ?? 0.5}
            focusY={props.profile?.avatar_focus_y ?? 0.5}
            zoom={props.profile?.avatar_zoom ?? 1}
            alt={props.label}
            fallback={<span>{props.getInitials(props.label)}</span>}
            fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed || props.label) }}
          />
          <button
            type="button"
            className="community-profile-message-action"
            disabled={!canMessage}
            onClick={() => {
              if (canMessage) props.onMessageUser?.(userId);
            }}
          >
            <MessageCircle aria-hidden="true" />
            <span>Message</span>
          </button>
        </div>
        <div className="chat-profile-hover-identity">
          <div className="chat-profile-hover-name-row">
            <button
              type="button"
              className="chat-profile-hover-name"
              onClick={() => {
                clearClose();
                setOpen(false);
                props.onOpenProfile?.(userId);
              }}
            >
              {props.label}
            </button>
          </div>
          {handleLabel ? <div className="chat-profile-hover-handle">{handleLabel}</div> : null}
        </div>
        {bio ? <div className="chat-profile-hover-bio">{bio}</div> : null}
      </div>
    </span>
  );
}

export function TypingIndicator(props: {
  users: CommunityTypingPresenceUser[];
  countCapped?: boolean;
  displayName: (userId: string) => string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
}) {
  if (props.users.length === 0) return null;
  const nameOf = (user: CommunityTypingPresenceUser) =>
    (user.display_name || props.displayName(user.user_id) || "Someone").split(" ")[0];
  const label =
    props.users.length === 1
      ? `${nameOf(props.users[0]!)} is typing`
      : props.users.length === 2
        ? `${nameOf(props.users[0]!)} and ${nameOf(props.users[1]!)} are typing`
        : `${nameOf(props.users[0]!)} and ${props.users.length - 1}${props.countCapped ? "+" : ""} others are typing`;
  return (
    <div className="community-interaction-typing" aria-live="polite">
      <span className="community-interaction-typing-avatars">
        {props.users.slice(0, 3).map((user) => (
          <UserAvatar
            key={user.user_id}
            className="community-interaction-typing-avatar"
            readyClassName="has-image"
            name={user.display_name || props.displayName(user.user_id)}
            imageUrl={user.avatar_url}
            alt=""
            aria-hidden={true}
            fallback={<span>{props.getInitials(user.display_name || props.displayName(user.user_id))}</span>}
            fallbackStyle={{ backgroundColor: props.getAvatarColor(user.user_id) }}
          />
        ))}
      </span>
      <span className="community-interaction-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="community-interaction-typing-label">{label}</span>
    </div>
  );
}

// Everything a mention chip needs to render, hover, and open a profile —
// bundled so call sites thread one object instead of eight props.
export type InteractionMentionContext = {
  mentions: CommunityInteractionMention[];
  displayName: (userId: string) => string;
  profilesByUserId?: Record<string, UserProfile>;
  currentUserId?: string | null;
  onOpenProfile?: (userId: string) => void;
  onMessageUser?: (userId: string) => void;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  // Label for community_agent mentions (default policy: the community's name).
  communityAgentDisplayName?: string;
};

function resolveMentionsForRendering(
  context: InteractionMentionContext,
): ResolvedMentionForRendering[] {
  const resolved: ResolvedMentionForRendering[] = [];
  const seenRoleKeys = new Set<string>();
  for (const mention of context.mentions) {
    const roleKey = String(mention.mentioned_role_key ?? "").trim();
    if (roleKey === "everybody" && !seenRoleKeys.has(roleKey)) {
      seenRoleKeys.add(roleKey);
      resolved.push({
        key: `role:${roleKey}`,
        label: roleKey,
        kind: "role",
        userId: null,
        isSelf: false,
      });
    }
    if (mention.mention_kind === "user" && mention.mentioned_user_id) {
      const userId = String(mention.mentioned_user_id);
      const handle = context.profilesByUserId?.[userId]?.handle?.trim();
      // Handles are the ONLY chip token for users (@handle — unique, stable).
      // Display-name text never chips: pre-handle messages and hand-typed
      // names stay plain text by design.
      if (!handle) continue;
      resolved.push({
        key: mention.id,
        label: handle,
        kind: mention.mention_kind,
        userId,
        isSelf: Boolean(context.currentUserId && userId === context.currentUserId),
      });
      continue;
    }
    if (mention.mention_kind === "community_agent") {
      resolved.push({
        key: mention.id,
        label: String(context.communityAgentDisplayName ?? "").trim(),
        kind: mention.mention_kind,
        userId: null,
        isSelf: false,
      });
    }
  }
  return resolved;
}

function MentionChipSpan(props: {
  text: string;
  mention: ResolvedMentionForRendering;
  context: InteractionMentionContext;
}) {
  const { mention, context } = props;
  const isAgent = mention.kind === "community_agent";
  const isRole = mention.kind === "role";
  const chipClassName = `community-mention-chip${mention.isSelf ? " is-self" : ""}${isAgent ? " is-agent" : ""}${isRole ? " is-role" : ""}`;
  if (!mention.userId || !context.onOpenProfile) {
    return <span className={chipClassName}>{props.text}</span>;
  }
  return (
    <ProfileHoverCard
      userId={mention.userId}
      label={mention.label}
      seed={mention.userId}
      profile={context.profilesByUserId?.[mention.userId] ?? null}
      getAvatarColor={context.getAvatarColor}
      getInitials={context.getInitials}
      currentUserId={context.currentUserId}
      onOpenProfile={context.onOpenProfile}
      onMessageUser={context.onMessageUser}
      triggerClassName="community-mention-trigger"
    >
      <span className={chipClassName}>{props.text}</span>
    </ProfileHoverCard>
  );
}

export type InteractionBodyProps = {
  text: string;
  renderTextWithLinks: (text: string) => ReactNode;
  mentionContext?: InteractionMentionContext;
};

export function InteractionBody(props: InteractionBodyProps) {
  const text = String(props.text ?? "").trim();
  if (!text) return null;
  const resolvedMentions =
    props.mentionContext && props.mentionContext.mentions.length > 0
      ? resolveMentionsForRendering(props.mentionContext)
      : [];

  const renderContactText = (segment: string): ReactNode =>
    tokenizeChatContactText(segment).map((token, index) => {
      if (token.kind === "text") {
        return <Fragment key={`text:${index}`}>{props.renderTextWithLinks(token.text)}</Fragment>;
      }
      return (
        <a key={`${token.kind}:${index}`} className="chat-link" href={token.href}>
          {token.text}
        </a>
      );
    });

  const renderMentionAwareText = (segment: string): ReactNode => {
    if (resolvedMentions.length === 0 || !props.mentionContext) {
      return renderContactText(segment);
    }
    const segments = splitBodyIntoMentionSegments(segment, resolvedMentions);
    return segments.map((segment, index) =>
      segment.type === "mention" ? (
        <MentionChipSpan
          key={`m:${index}:${segment.mention.key}`}
          text={segment.text}
          mention={segment.mention}
          context={props.mentionContext!}
        />
      ) : (
        <Fragment key={`t:${index}`}>{renderContactText(segment.text)}</Fragment>
      ),
    );
  };

  const renderInline = (segment: string): ReactNode =>
    renderChatInlineMarkdown(segment, {
      renderTextRun: renderMentionAwareText,
      renderFormattedRun: renderMentionAwareText,
      allowLabeledLinks: true,
    });

  return (
    <div className="community-interaction-body community-interaction-chat-markdown">
      <ChatBlockMarkdown text={text} renderInline={renderInline} />
    </div>
  );
}

export function InteractionContent(
  props: InteractionBodyProps & {
    afterBody?: ReactNode;
  },
) {
  return (
    <>
      <InteractionBody
        text={props.text}
        renderTextWithLinks={props.renderTextWithLinks}
        mentionContext={props.mentionContext}
      />
      <MessageLinkMedia text={props.text} />
      {props.afterBody}
    </>
  );
}

// Render a post's attachments: images in a grid, video/audio as inline players, and any other
// file as a download chip.
function ProtectedInteractionAttachment({ attachment, onOpenImage }: {
  attachment: CommunityInteractionAttachment;
  onOpenImage?: (images: CommunityChatMediaImage[], index: number) => void;
}) {
  const scope = useContext(CommunityChannelSessionContext);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => {
    setUrl(null); setBusy(false); setError(null);
    return () => {
      request.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [scope?.session, scope?.communityId, attachment.id]);
  const open = async () => {
    if (!scope?.session || busy) return;
    const abort = new AbortController(); request.current = abort;
    setBusy(true); setError(null);
    try {
      const bytes = await downloadCloudCommunityChatAttachment({ session: scope.session, attachmentId: attachment.id, signal: abort.signal });
      if (abort.signal.aborted) return;
      const media = /^(image|video|audio)\//.test(attachment.mime ?? "");
      const blob = new Blob([bytes], { type: media ? attachment.mime! : "application/octet-stream" });
      const nextUrl = URL.createObjectURL(blob); objectUrl.current = nextUrl;
      if (media) setUrl(nextUrl);
      else {
        const link = document.createElement("a"); link.href = nextUrl; link.download = attachment.name; link.click();
        URL.revokeObjectURL(nextUrl); objectUrl.current = null;
      }
    } catch { if (!abort.signal.aborted) setError("Attachment unavailable. Check your access and try again."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  };
  // Images load on their own so they show as pictures, like in open channels,
  // through the shared store (one download, also used by the pod panel);
  // other files wait for a click.
  const isImage = /^image\//.test(attachment.mime ?? "");
  const imageUrl = useProtectedImage(isImage ? scope?.session ?? null : null, attachment.id, attachment.mime ?? null);
  const shownUrl = isImage ? imageUrl : url;
  return shownUrl ? <InteractionAttachments attachments={[{ ...attachment, protected_download: false, url: shownUrl }]} onOpenImage={onOpenImage} />
    : <div><button className="attachment-item" type="button" disabled={isImage || busy || !scope?.session} onClick={() => void open()}>
      <span className="attachment-name">{isImage ? (scope?.session ? "Loading image…" : attachment.name) : busy ? "Opening…" : attachment.name}</span></button>{error ? <p role="alert">{error}</p> : null}</div>;
}

export function InteractionAttachments(props: {
  attachments: CommunityInteractionAttachment[];
  onOpenImage?: (images: CommunityChatMediaImage[], index: number) => void;
}) {
  const { imageAttachments, videoAttachments, audioAttachments, fileAttachments } =
    partitionCommunityAttachments(props.attachments.filter(attachment => !attachment.protected_download));
  if (
    imageAttachments.length === 0 &&
    videoAttachments.length === 0 &&
    audioAttachments.length === 0 &&
    fileAttachments.length === 0
    && !props.attachments.some(attachment => attachment.protected_download)
  ) {
    return null;
  }
  const imageViews = imageAttachments.map((item) => ({
    id: item.attachment.id,
    url: item.url,
    previewUrl: item.previewUrl,
    fullUrl: item.fullUrl,
    name: item.name,
  }));
  return (
    <div className="community-interaction-attachments">
      {props.attachments.filter(attachment => attachment.protected_download).map(attachment =>
        <ProtectedInteractionAttachment key={attachment.id} attachment={attachment} onOpenImage={props.onOpenImage} />)}
      {imageViews.length > 0 ? (
        <CommunityChatMediaGrid
          images={imageViews}
          onOpenImage={
            props.onOpenImage ??
            ((images, index) => {
              const target = images[index]?.fullUrl || images[index]?.url;
              if (target) window.open(target, "_blank", "noopener,noreferrer");
            })
          }
        />
      ) : null}
      <CommunityChatMediaPlayers videos={videoAttachments} audios={audioAttachments} />
      {fileAttachments.length > 0 ? (
        <div className="attachments-preview chat-attachments-preview">
          {fileAttachments.map((attachment) => {
            const href = typeof attachment.url === "string" && attachment.url.trim() ? attachment.url.trim() : null;
            if (href && safeDocumentUrl(href) && isPdfDocument(attachment.name, attachment.mime)) {
              return <PdfDocumentCard key={attachment.id} url={href} name={attachment.name} />;
            }
            return (
              <button
                key={attachment.id}
                type="button"
                className="attachment-item"
                disabled={!href}
                title={attachment.name}
                onClick={href ? () => window.open(href, "_blank", "noopener,noreferrer") : undefined}
              >
                <span className="attachment-name">{attachment.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CommunityInteractionFeedList(
  props: WebCommunityInteractionProjectionProps & {
    showDayDividers?: boolean;
    editing: { type: "root" | "reply"; id: string } | null;
    editText: string;
    onStartEdit: (type: "root" | "reply", id: string, body: string) => void;
    onEditTextChange: (value: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
  },
) {
  const agentName = useCommunityAgentName(props.activeCommunityName);
  const seenRootIds = useRef<Set<string>>(new Set());
  const rootsLoadedOnce = useRef(false);
  useEffect(() => {
    if (!rootsLoadedOnce.current && props.roots.length === 0 && props.isLoadingRoots) return;
    for (const bundle of props.roots) seenRootIds.current.add(bundle.root.id);
    rootsLoadedOnce.current = true;
  }, [props.roots, props.isLoadingRoots]);
  const editing = props.editing;
  const editText = props.editText;
  const startEdit = props.onStartEdit;
  const setEditText = props.onEditTextChange;
  const saveEdit = props.onSaveEdit;
  const cancelEdit = props.onCancelEdit;
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
  return (
          props.error && props.roots.length === 0 && props.activityEvents.length === 0 ? (
            <div className="community-interaction-state" role="alert">
              <div>{props.error}</div>
              <button type="button" onClick={props.onRetryRoots}>
                {props.errorActionLabel ?? "Retry"}
              </button>
            </div>
          ) : props.isLoadingRoots && props.roots.length === 0 && props.activityEvents.length === 0 ? (
            <div className="community-interaction-state" aria-live="polite">
              <div>Loading threads...</div>
              <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
            </div>
          ) : props.roots.length === 0 && props.activityEvents.length === 0 ? (
            <div className="community-interaction-empty">
              <MessageSquare size={22} aria-hidden="true" />
              <div>No threads yet</div>
              <span>New community messages will appear here as canonical threads.</span>
            </div>
          ) : (
            <div className="community-interaction-feed">
              {props.error ? (
                <div className="community-interaction-refresh-warning" role="status">
                  <span>{props.error}</span>
                  <button type="button" onClick={props.onRetryRoots}>
                    {props.errorActionLabel ?? "Retry"}
                  </button>
                </div>
              ) : null}
              {segments.map((segment) => {
                const dividerBefore = segment.key === firstUnreadSegmentKey ? unreadDivider : null;
                if (segment.type === "day") {
                  if (props.showDayDividers === false) return null;
                  return (
                    <Fragment key={segment.key}>
                      {dividerBefore}
                      <div className="community-interaction-day">
                        <span>{segment.label}</span>
                      </div>
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
                      <div className="community-interaction-system">
                        <span>{body}</span>
                      </div>
                    </Fragment>
                  );
                }
                if (segment.type === "member_arrivals") {
                  const actorIds = Array.from(new Set(
                    segment.events
                      .map((event) => String(event.actor_user_id ?? "").trim())
                      .filter(Boolean),
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
                        <MemberAvatarStack
                          faces={faces}
                          totalCount={faces.length}
                          limit={4}
                          decorative
                          className="community-interaction-member-arrival-faces"
                          imageLoading="lazy"
                        />
                        <span>{label}</span>
                      </div>
                    </Fragment>
                  );
                }
                const first = segment.bundles[0]!;
                const label = actorLabel(first.root, props.displayName, agentName);
                const profile = first.root.actor_user_id
                  ? props.profilesByUserId[first.root.actor_user_id] ?? null
                  : null;
                const badge = agentBadgeLabel(first.root.actor_type);
                const chip = kindChipLabel(first.root.kind);
                return (
                  <Fragment key={segment.key}>
                    {dividerBefore}
                    <div className="community-interaction-group">
                    <div className="community-interaction-group-gutter">
                      <ProfileHoverCard
                        userId={first.root.actor_user_id}
                        label={label}
                        seed={first.root.actor_user_id ?? first.root.actor_agent_key ?? first.root.id}
                        profile={profile}
                        getAvatarColor={props.getAvatarColor}
                        getInitials={props.getInitials}
                        currentUserId={props.currentUserId}
                        onOpenProfile={props.onOpenProfile}
                        onMessageUser={props.onMessageUser}
                      />
                    </div>
                    <div className="community-interaction-group-body">
                      <div className="community-interaction-meta-row">
                        <ProfileHoverCard
                          userId={first.root.actor_user_id}
                          label={label}
                          seed={first.root.actor_user_id ?? first.root.actor_agent_key ?? first.root.id}
                          profile={profile}
                          getAvatarColor={props.getAvatarColor}
                          getInitials={props.getInitials}
                          currentUserId={props.currentUserId}
                          onOpenProfile={props.onOpenProfile}
                          onMessageUser={props.onMessageUser}
                          triggerClassName="community-interaction-author-trigger"
                        >
                          <span className="community-interaction-author">{label}</span>
                        </ProfileHoverCard>
                        {badge ? <span className="community-interaction-badge">{badge}</span> : null}
                        {chip ? <span className="community-interaction-kind">{chip}</span> : null}
                        <span>{props.formatChatTime(first.root.created_at)}</span>
                      </div>
                      {segment.bundles.map((bundle) => {
                        const root = bundle.root;
                        const body = stripSharedAttachmentSummary(
                          bundleText(bundle.content_blocks, root.content_summary),
                          bundle.attachments.length > 0,
                        );
                        const selected = root.id === props.selectedRootId;
                        const threadTypers = (props.typingPresence?.users ?? []).filter(
                          (user) => user.user_id !== props.currentUserId && user.root_id === root.id,
                        );
                        const threadHasUnread = Boolean(
                          unreadBoundary &&
                            root.last_reply_at &&
                            root.last_reply_actor_user_id !== props.currentUserId &&
                            Date.parse(root.last_reply_at) > unreadBoundary,
                        );
                        // Touch screens have no hover toolbar, so a message with no
                        // replies yet carries a visible Reply link there instead.
                        const showReplyStart = !bundle.pending && root.reply_count === 0 && threadTypers.length === 0;
                        const hasFooter =
                          root.reply_count > 0 ||
                          root.reaction_summary.length > 0 ||
                          threadTypers.length > 0 ||
                          showReplyStart;
                        const replyStartOnly =
                          showReplyStart && root.reaction_summary.length === 0;
                        const isOwnRoot = Boolean(
                          props.currentUserId && root.actor_user_id && root.actor_user_id === props.currentUserId,
                        );
                        const isEditingRoot = editing?.type === "root" && editing.id === root.id;
                        const isNewRoot = rootsLoadedOnce.current && !seenRootIds.current.has(root.id);
                        const isFirstRoot = root.id === props.roots[0]?.root.id;
                        const firstRootBodyExpansion = isFirstRoot ? props.firstRootBodyExpansion : undefined;
                        return (
                          <div
                            key={root.id}
                            className={`community-interaction-message${selected ? " selected" : ""}${isNewRoot ? " is-new" : ""}${interactionMentionsViewer(bundle.mentions, props.currentUserId, root.actor_user_id) ? " is-self-mentioned" : ""}${bundle.pending ? ` is-pending is-pending-${bundle.pending}` : ""}`}
                          >
                            {bundle.pending ? null : (
                              <MessageActions
                                onReact={(emoji) => props.onToggleReaction?.("root", root.id, emoji)}
                                onReply={() => props.onSelectRoot(root.id)}
                                replyLabel="Reply in thread"
                                onEdit={
                                  // A poll or form post's text is only its fallback; the card is the post.
                                  isOwnRoot && props.onEditMessage && !bundle.post_card
                                    ? () => startEdit("root", root.id, body)
                                    : undefined
                                }
                                onDelete={
                                  (isOwnRoot || props.canModerateContent) && props.onDeleteMessage
                                    ? () => {
                                        if (window.confirm(isOwnRoot ? "Delete this message?" : "Remove this message for everyone?")) {
                                          props.onDeleteMessage?.("root", root.id);
                                        }
                                      }
                                    : undefined
                                }
                                onPin={
                                  props.canManagePinnedRoot && props.onSetPinnedRoot
                                    ? () => {
                                        const place = props.activeChannel?.access_mode === "restricted" ? "pod" : "channel";
                                        const setPin = (rootId: string | null) => void Promise.resolve(props.onSetPinnedRoot?.(rootId)).then((done) => {
                                          if (done !== false) toastInPage(rootId ? `Pinned to ${place}` : `Unpinned from ${place}`);
                                        });
                                        if (props.pinnedRoot?.root.id === root.id) {
                                          setPin(null);
                                          return;
                                        }
                                        // One pin per channel or pod: say so before replacing it.
                                        const replace = props.pinnedRoot
                                          ? confirmInPage({
                                              title: "Replace the pinned message?",
                                              body: `This ${place} keeps one pinned message. Pinning this one unpins the current one.`,
                                              confirmLabel: "Pin this instead",
                                            })
                                          : Promise.resolve(true);
                                        void replace.then((ok) => { if (ok) setPin(root.id); });
                                      }
                                    : undefined
                                }
                                isPinned={props.pinnedRoot?.root.id === root.id}
                                pinPlace={props.activeChannel?.access_mode === "restricted" ? "pod" : "channel"}
                              />
                            )}
                            {root.title ? <div className="community-interaction-title">{root.title}</div> : null}
                            {isEditingRoot ? (
                              <EditForm
                                value={editText}
                                onChange={setEditText}
                                onSave={saveEdit}
                                onCancel={cancelEdit}
                              />
                            ) : (
                              <>
                                <div
                                  className={`community-interaction-root-body${
                                    firstRootBodyExpansion && !firstRootBodyExpansion.expanded
                                      ? " is-mobile-collapsed"
                                      : ""
                                  }`}
                                >
                                  {bundle.post_card ? <PostCardView bundle={bundle} /> : <InteractionContent
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
                                      communityAgentDisplayName: agentName,
                                    }}
                                    afterBody={(
                                      <InteractionAttachments
                                        attachments={bundle.attachments}
                                        onOpenImage={props.onOpenCommunityChatLightbox}
                                      />
                                    )}
                                  />}
                                </div>
                                {firstRootBodyExpansion && !firstRootBodyExpansion.expanded ? (
                                  <button
                                    type="button"
                                    className="community-interaction-root-expand"
                                    aria-expanded={false}
                                    onClick={firstRootBodyExpansion.onToggle}
                                  >
                                    Show more
                                  </button>
                                ) : null}
                                {root.edited_at ? (
                                  <span className="community-interaction-edited">(edited)</span>
                                ) : null}
                              </>
                            )}
                            {bundle.pending === "sending" ? (
                              <span className="community-interaction-sending-spinner" role="status" aria-label="Sending message" />
                            ) : bundle.pending === "failed" ? (
                              <div className="community-interaction-pending-status is-failed">
                                <span>Failed to send.</span>
                                <button type="button" onClick={() => props.onRetrySend?.(root.idempotency_key)}>
                                  Retry
                                </button>
                                <button type="button" onClick={() => props.onDiscardPending?.(root.idempotency_key)}>
                                  Discard
                                </button>
                              </div>
                            ) : null}
                            {hasFooter ? (
                              <div className={`community-interaction-footer${replyStartOnly ? " is-reply-start-only" : ""}`}>
                                <ReactionSummary
                                  rows={root.reaction_summary}
                                  viewerEmojis={root.viewer_emojis}
                                  onToggle={(emoji) => props.onToggleReaction?.("root", root.id, emoji)}
                                  target={{ type: "root", id: root.id }}
                                />
                                {threadTypers.length > 0 ? (
                                  <div className="community-interaction-thread-row">
                                    <ActorAvatar
                                      className="community-interaction-thread-avatar"
                                      label={threadTypers[0]!.display_name || props.displayName(threadTypers[0]!.user_id)}
                                      seed={threadTypers[0]!.user_id}
                                      profile={props.profilesByUserId[threadTypers[0]!.user_id] ?? null}
                                      getAvatarColor={props.getAvatarColor}
                                      getInitials={props.getInitials}
                                    />
                                    <button
                                      type="button"
                                      className="community-interaction-reply-pill is-typing"
                                      onClick={() => props.onSelectRoot(root.id)}
                                    >
                                      <span className="community-interaction-typing-dots" aria-hidden="true">
                                        <span />
                                        <span />
                                        <span />
                                      </span>
                                      <span>typing…</span>
                                    </button>
                                  </div>
                                ) : root.reply_count > 0 ? (
                                  <div className="community-interaction-thread-row">
                                    {root.last_reply_actor_user_id ? (
                                      <ActorAvatar
                                        className="community-interaction-thread-avatar"
                                        label={props.displayName(root.last_reply_actor_user_id)}
                                        seed={root.last_reply_actor_user_id}
                                        profile={props.profilesByUserId[root.last_reply_actor_user_id] ?? null}
                                        getAvatarColor={props.getAvatarColor}
                                        getInitials={props.getInitials}
                                      />
                                    ) : null}
                                    <button
                                      type="button"
                                      className={`community-interaction-reply-pill${threadHasUnread ? " is-unread" : ""}`}
                                      onClick={() => props.onSelectRoot(root.id)}
                                    >
                                      {threadHasUnread ? (
                                        <span className="community-interaction-unread-dot" aria-hidden="true" />
                                      ) : null}
                                      {root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}
                                    </button>
                                    {root.last_reply_at ? (
                                      <span className="community-interaction-thread-time">
                                        Last reply {formatRelativeTime(root.last_reply_at)}
                                      </span>
                                    ) : null}
                                    <span className="community-interaction-thread-open" aria-hidden="true">View thread</span>
                                  </div>
                                ) : showReplyStart ? (
                                  <button
                                    type="button"
                                    className="community-interaction-reply-start"
                                    onClick={() => props.onSelectRoot(root.id)}
                                  >
                                    <MessageSquare size={14} aria-hidden="true" />
                                    Reply
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          )
  );
}
