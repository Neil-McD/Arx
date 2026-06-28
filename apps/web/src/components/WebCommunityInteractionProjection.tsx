import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CornerUpLeft,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  SmilePlus,
  Trash2,
} from "lucide-react";
import type {
  CommunityInteractionContentBlock,
  CommunityInteractionEmbed,
  CommunityInteractionReplyBundle,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import type { UserProfile } from "../../../../shared/communityTypes";
import { UserAvatar } from "../../../../shared/UserAvatar";
import { groupInteractionFeed } from "./groupInteractionFeed";

export type WebCommunityInteractionProjectionProps = {
  activeCommunityName: string;
  roots: CommunityInteractionRootBundle[];
  selectedRootId: string | null;
  replies: CommunityInteractionReplyBundle[];
  isLoadingRoots: boolean;
  isLoadingReplies: boolean;
  error: string | null;
  repliesError: string | null;
  onSelectRoot: (rootId: string) => void;
  onCloseDrawer: () => void;
  onStartRootReply?: (message: { id: string; sender_id: string; body: string; interaction_root_id: string }) => void;
  mainComposer?: ReactNode;
  drawerComposer?: ReactNode;
  onRetryRoots: () => void;
  onRetryReplies: (rootId: string) => void;
  profilesByUserId: Record<string, UserProfile>;
  displayName: (userId: string) => string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  formatChatTime: (value: string) => string;
  renderTextWithLinks: (text: string) => ReactNode;
  onToggleReaction?: (targetType: "root" | "reply", targetId: string, emoji: string) => void;
  currentUserId?: string | null;
  onEditMessage?: (targetType: "root" | "reply", targetId: string, text: string) => void;
  onDeleteMessage?: (targetType: "root" | "reply", targetId: string) => void;
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "👀", "🙏", "🚀", "💯", "✅", "👏", "😮"];

function EmojiPickerButton(props: {
  className: string;
  label: string;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="community-interaction-emoji-picker" ref={ref}>
      <button
        type="button"
        className={props.className}
        aria-label={props.label}
        title={props.label}
        onClick={() => setOpen((value) => !value)}
      >
        <SmilePlus size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="community-interaction-emoji-popover" role="menu">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="community-interaction-emoji-option"
              onClick={() => {
                props.onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function actorLabel(
  actor: {
    actor_type: string;
    actor_user_id: string | null;
    actor_agent_key: string | null;
  },
  displayName: (userId: string) => string,
): string {
  if (actor.actor_user_id) return displayName(actor.actor_user_id);
  if (actor.actor_agent_key) return actor.actor_agent_key.replace(/_/g, " ");
  if (actor.actor_type === "community_agent") return "Community agent";
  if (actor.actor_type === "personal_agent") return "Personal agent";
  if (actor.actor_type === "system") return "System";
  return "Member";
}

function kindChipLabel(kind: string): string | null {
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

function agentBadgeLabel(actorType: string): string | null {
  if (actorType === "community_agent" || actorType === "personal_agent") return "Agent";
  return null;
}

function hostnameOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sortedBlocks(blocks: CommunityInteractionContentBlock[]): CommunityInteractionContentBlock[] {
  return [...blocks].sort((left, right) => left.block_order - right.block_order);
}

function blockText(block: CommunityInteractionContentBlock): string {
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

function bundleText(blocks: CommunityInteractionContentBlock[], fallback: string): string {
  const text = sortedBlocks(blocks)
    .map(blockText)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || fallback;
}

const QUICK_REACTIONS = ["👍", "❤️", "🔥"];

function OverflowMenu(props: { onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (!props.onEdit && !props.onDelete) return null;
  return (
    <div className="community-interaction-emoji-picker" ref={ref}>
      <button
        type="button"
        className="community-interaction-msg-action"
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="community-interaction-overflow-menu" role="menu">
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

function EditForm(props: {
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

function MessageActions(props: {
  onReact: (emoji: string) => void;
  onReply: () => void;
  replyLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="community-interaction-msg-actions">
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
      <button
        type="button"
        className="community-interaction-msg-action"
        onClick={props.onReply}
        aria-label={props.replyLabel}
        title={props.replyLabel}
      >
        <MessageSquare size={15} aria-hidden="true" />
      </button>
      <OverflowMenu onEdit={props.onEdit} onDelete={props.onDelete} />
    </div>
  );
}

function ReactionSummary(props: {
  rows: Array<{ emoji: string; count: number }>;
  viewerEmojis?: string[];
  onToggle?: (emoji: string) => void;
}) {
  if (props.rows.length === 0) return null;
  const viewer = new Set(props.viewerEmojis ?? []);
  return (
    <div className="community-interaction-reactions" aria-label="Reactions">
      {props.rows.map((row) => (
        <button
          key={row.emoji}
          type="button"
          className={`community-interaction-reaction${viewer.has(row.emoji) ? " is-mine" : ""}`}
          onClick={() => props.onToggle?.(row.emoji)}
          disabled={!props.onToggle}
        >
          <span>{row.emoji}</span>
          <span>{row.count}</span>
        </button>
      ))}
    </div>
  );
}

function EmbedCards(props: { embeds: CommunityInteractionEmbed[] }) {
  const visible = props.embeds.filter(
    (embed) => embed.status !== "redacted" && (embed.embed_kind === "link" || embed.embed_kind === "workspace_ref"),
  );
  if (visible.length === 0) return null;
  return (
    <div className="community-interaction-embeds">
      {visible.map((embed) => {
        if (embed.status === "pending") {
          return (
            <div
              key={embed.id}
              className="community-interaction-embed is-pending web-skeleton-pill"
              aria-hidden="true"
            />
          );
        }
        const href = embed.source_url ?? undefined;
        if (embed.status !== "ready") {
          if (!href) return null;
          return (
            <a
              key={embed.id}
              className="community-interaction-embed is-bare"
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(event) => event.stopPropagation()}
            >
              {embed.source_url}
            </a>
          );
        }
        const provider = embed.provider || hostnameOf(embed.source_url);
        return (
          <a
            key={embed.id}
            className="community-interaction-embed"
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
          >
            {embed.image_url ? (
              <img className="community-interaction-embed-media" src={embed.image_url} alt="" loading="lazy" />
            ) : null}
            <div className="community-interaction-embed-text">
              {provider ? <span className="community-interaction-embed-provider">{provider}</span> : null}
              {embed.title ? <span className="community-interaction-embed-title">{embed.title}</span> : null}
              {embed.description ? <span className="community-interaction-embed-desc">{embed.description}</span> : null}
            </div>
          </a>
        );
      })}
    </div>
  );
}

function QuoteChip(props: {
  quoted: CommunityInteractionReplyBundle | undefined;
  displayName: (userId: string) => string;
}) {
  const label = props.quoted ? actorLabel(props.quoted.reply, props.displayName) : "a reply";
  const snippet = props.quoted
    ? bundleText(props.quoted.content_blocks, props.quoted.reply.content_summary)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
    : "";
  return (
    <div className="community-interaction-quote" aria-label={`In reply to ${label}`}>
      <CornerUpLeft size={12} aria-hidden="true" />
      <span className="community-interaction-quote-author">{label}</span>
      {snippet ? <span className="community-interaction-quote-text">{snippet}</span> : null}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
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

function ActorAvatar(props: {
  label: string;
  seed: string;
  profile?: UserProfile | null;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
  className?: string;
}) {
  return (
    <UserAvatar
      className={props.className ?? "community-interaction-avatar"}
      readyClassName="has-image"
      imageClassName="community-interaction-avatar-image"
      fallbackClassName="community-interaction-avatar-fallback"
      name={props.label}
      imageUrl={props.profile?.avatar_url ?? null}
      focusX={props.profile?.avatar_focus_x ?? 0.5}
      focusY={props.profile?.avatar_focus_y ?? 0.5}
      zoom={props.profile?.avatar_zoom ?? 1}
      fallback={<span>{props.getInitials(props.label)}</span>}
      fallbackStyle={{ backgroundColor: props.getAvatarColor(props.seed || props.label) }}
      alt=""
      aria-hidden={true}
    />
  );
}

function InteractionBody(props: {
  text: string;
  renderTextWithLinks: (text: string) => ReactNode;
}) {
  const parts = props.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="community-interaction-body">
      {parts.map((part, index) => (
        <p key={`${index}:${part.slice(0, 24)}`}>{props.renderTextWithLinks(part)}</p>
      ))}
    </div>
  );
}

export function WebCommunityInteractionProjection(props: WebCommunityInteractionProjectionProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevRootCount = useRef(0);
  const [editing, setEditing] = useState<{ type: "root" | "reply"; id: string } | null>(null);
  const [editText, setEditText] = useState("");
  const startEdit = (type: "root" | "reply", id: string, body: string) => {
    setEditing({ type, id });
    setEditText(body);
  };
  const cancelEdit = () => setEditing(null);
  const saveEdit = () => {
    if (!editing) return;
    const text = editText.trim();
    if (text) props.onEditMessage?.(editing.type, editing.id, text);
    setEditing(null);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const previous = prevRootCount.current;
    prevRootCount.current = props.roots.length;
    if (props.roots.length > previous) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (previous === 0 || distanceFromBottom < 200) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [props.roots.length]);

  const selectedRoot = props.selectedRootId
    ? props.roots.find((bundle) => bundle.root.id === props.selectedRootId) ?? null
    : null;
  const selectedRootLabel = selectedRoot ? actorLabel(selectedRoot.root, props.displayName) : "";
  const selectedRootText = selectedRoot
    ? bundleText(selectedRoot.content_blocks, selectedRoot.root.content_summary)
    : "";
  const selectedRootChip = selectedRoot ? kindChipLabel(selectedRoot.root.kind) : null;
  const selectedRootBadge = selectedRoot ? agentBadgeLabel(selectedRoot.root.actor_type) : null;

  const segments = groupInteractionFeed(props.roots);
  const replyById = new Map(props.replies.map((bundle) => [bundle.reply.id, bundle] as const));

  return (
    <div className={`community-interaction-projection${selectedRoot ? " has-drawer" : ""}`}>
      <div className="community-interaction-main">
        <div className="community-interaction-feed-scroll" ref={scrollRef}>
          {props.error ? (
            <div className="community-interaction-state" role="alert">
              <div>{props.error}</div>
              <button type="button" onClick={props.onRetryRoots}>Retry</button>
            </div>
          ) : props.isLoadingRoots && props.roots.length === 0 ? (
            <div className="community-interaction-state" aria-live="polite">
              <div>Loading threads...</div>
              <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
            </div>
          ) : props.roots.length === 0 ? (
            <div className="community-interaction-empty">
              <MessageSquare size={22} aria-hidden="true" />
              <div>No threads yet</div>
              <span>New community messages will appear here as canonical threads.</span>
            </div>
          ) : (
            <div className="community-interaction-feed">
              {segments.map((segment) => {
                if (segment.type === "day") {
                  return (
                    <div key={segment.key} className="community-interaction-day">
                      <span>{segment.label}</span>
                    </div>
                  );
                }
                if (segment.type === "system") {
                  const body = bundleText(segment.bundle.content_blocks, segment.bundle.root.content_summary);
                  return (
                    <div key={segment.key} className="community-interaction-system">
                      <span>{body}</span>
                    </div>
                  );
                }
                const first = segment.bundles[0]!;
                const label = actorLabel(first.root, props.displayName);
                const profile = first.root.actor_user_id
                  ? props.profilesByUserId[first.root.actor_user_id] ?? null
                  : null;
                const badge = agentBadgeLabel(first.root.actor_type);
                const chip = kindChipLabel(first.root.kind);
                return (
                  <div key={segment.key} className={`community-interaction-group${badge ? " is-agent" : ""}`}>
                    <div className="community-interaction-group-gutter">
                      <ActorAvatar
                        label={label}
                        seed={first.root.actor_user_id ?? first.root.actor_agent_key ?? first.root.id}
                        profile={profile}
                        getAvatarColor={props.getAvatarColor}
                        getInitials={props.getInitials}
                      />
                    </div>
                    <div className="community-interaction-group-body">
                      <div className="community-interaction-meta-row">
                        <span className="community-interaction-author">{label}</span>
                        {badge ? <span className="community-interaction-badge">{badge}</span> : null}
                        {chip ? <span className="community-interaction-kind">{chip}</span> : null}
                        <span>{props.formatChatTime(first.root.created_at)}</span>
                      </div>
                      {segment.bundles.map((bundle) => {
                        const root = bundle.root;
                        const body = bundleText(bundle.content_blocks, root.content_summary);
                        const selected = root.id === props.selectedRootId;
                        const hasFooter = root.reply_count > 0 || root.reaction_summary.length > 0;
                        const isOwnRoot = Boolean(
                          props.currentUserId && root.actor_user_id && root.actor_user_id === props.currentUserId,
                        );
                        const isEditingRoot = editing?.type === "root" && editing.id === root.id;
                        return (
                          <div
                            key={root.id}
                            className={`community-interaction-message${selected ? " selected" : ""}`}
                          >
                            <MessageActions
                              onReact={(emoji) => props.onToggleReaction?.("root", root.id, emoji)}
                              onReply={() => props.onSelectRoot(root.id)}
                              replyLabel="Reply in thread"
                              onEdit={
                                isOwnRoot && props.onEditMessage
                                  ? () => startEdit("root", root.id, body)
                                  : undefined
                              }
                              onDelete={
                                isOwnRoot && props.onDeleteMessage
                                  ? () => {
                                      if (window.confirm("Delete this message?")) {
                                        props.onDeleteMessage?.("root", root.id);
                                      }
                                    }
                                  : undefined
                              }
                            />
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
                                <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                                <EmbedCards embeds={bundle.embeds} />
                                {root.edited_at ? (
                                  <span className="community-interaction-edited">(edited)</span>
                                ) : null}
                              </>
                            )}
                            {hasFooter ? (
                              <div className="community-interaction-footer">
                                {root.reply_count > 0 ? (
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
                                      className="community-interaction-reply-pill"
                                      onClick={() => props.onSelectRoot(root.id)}
                                    >
                                      {root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}
                                    </button>
                                    {root.last_reply_at ? (
                                      <span className="community-interaction-thread-time">
                                        Last reply {formatRelativeTime(root.last_reply_at)}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                <ReactionSummary
                                  rows={root.reaction_summary}
                                  viewerEmojis={root.viewer_emojis}
                                  onToggle={(emoji) => props.onToggleReaction?.("root", root.id, emoji)}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {props.mainComposer ? (
          <div className="community-interaction-main-composer">{props.mainComposer}</div>
        ) : null}
      </div>

      {selectedRoot ? (
        <aside className="community-interaction-drawer" aria-label="Thread replies">
          <div className="community-interaction-drawer-header">
            <button
              className="back-to-workspace"
              type="button"
              onClick={props.onCloseDrawer}
              title="Back to channel"
            >
              <svg viewBox="0 0 24 24" className="back-icon" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="back-path">thread</span>
            </button>
          </div>
          <div className="community-interaction-drawer-scroll">
            <div className="community-interaction-drawer-root">
              <div className="community-interaction-thread-anchor">
                <ActorAvatar
                  label={selectedRootLabel}
                  seed={selectedRoot.root.actor_user_id ?? selectedRoot.root.actor_agent_key ?? selectedRoot.root.id}
                  profile={
                    selectedRoot.root.actor_user_id
                      ? props.profilesByUserId[selectedRoot.root.actor_user_id] ?? null
                      : null
                  }
                  getAvatarColor={props.getAvatarColor}
                  getInitials={props.getInitials}
                />
                <div className="community-interaction-thread-anchor-content">
                  <div className="community-interaction-meta-row">
                    <span className="community-interaction-author">{selectedRootLabel}</span>
                    {selectedRootBadge ? (
                      <span className="community-interaction-badge">{selectedRootBadge}</span>
                    ) : null}
                    {selectedRootChip ? (
                      <span className="community-interaction-kind">{selectedRootChip}</span>
                    ) : null}
                    <span>{props.formatChatTime(selectedRoot.root.created_at)}</span>
                  </div>
                  {selectedRoot.root.title ? (
                    <div className="community-interaction-title">{selectedRoot.root.title}</div>
                  ) : null}
                  <InteractionBody text={selectedRootText} renderTextWithLinks={props.renderTextWithLinks} />
                  <EmbedCards embeds={selectedRoot.embeds} />
                  <div className="community-interaction-thread-anchor-actions">
                    <ReactionSummary
                      rows={selectedRoot.root.reaction_summary}
                      viewerEmojis={selectedRoot.root.viewer_emojis}
                      onToggle={(emoji) => props.onToggleReaction?.("root", selectedRoot.root.id, emoji)}
                    />
                    <EmojiPickerButton
                      className="community-interaction-reaction-add"
                      label="Add reaction"
                      onPick={(emoji) => props.onToggleReaction?.("root", selectedRoot.root.id, emoji)}
                    />
                  </div>
                </div>
              </div>
            </div>
            {props.repliesError ? (
              <div className="community-interaction-state" role="alert">
                <div>{props.repliesError}</div>
                <button type="button" onClick={() => props.onRetryReplies(selectedRoot.root.id)}>Retry</button>
              </div>
            ) : props.isLoadingReplies && props.replies.length === 0 ? (
              <div className="community-interaction-state" aria-live="polite">
                <div>Loading replies...</div>
                <div className="community-interaction-loading web-skeleton-pill" aria-hidden="true" />
              </div>
            ) : props.replies.length === 0 ? (
              <div className="community-interaction-drawer-empty">No replies yet.</div>
            ) : (
              <div className="community-interaction-reply-list">
                {props.replies.map((bundle) => {
                  const reply = bundle.reply;
                  const label = actorLabel(reply, props.displayName);
                  const profile = reply.actor_user_id ? props.profilesByUserId[reply.actor_user_id] ?? null : null;
                  const body = bundleText(bundle.content_blocks, reply.content_summary);
                  const badge = agentBadgeLabel(reply.actor_type);
                  const isOwnReply = Boolean(
                    props.currentUserId && reply.actor_user_id && reply.actor_user_id === props.currentUserId,
                  );
                  const isEditingReply = editing?.type === "reply" && editing.id === reply.id;
                  return (
                    <div key={reply.id} className="community-interaction-reply">
                      <MessageActions
                        onReact={(emoji) => props.onToggleReaction?.("reply", reply.id, emoji)}
                        onReply={() => {
                          if (!reply.legacy_message_id || !reply.actor_user_id) return;
                          props.onStartRootReply?.({
                            id: reply.legacy_message_id,
                            sender_id: reply.actor_user_id,
                            body,
                            interaction_root_id: reply.root_id,
                          });
                        }}
                        replyLabel="Reply to this message"
                        onEdit={
                          isOwnReply && props.onEditMessage
                            ? () => startEdit("reply", reply.id, body)
                            : undefined
                        }
                        onDelete={
                          isOwnReply && props.onDeleteMessage
                            ? () => {
                                if (window.confirm("Delete this reply?")) {
                                  props.onDeleteMessage?.("reply", reply.id);
                                }
                              }
                            : undefined
                        }
                      />
                      <ActorAvatar
                        label={label}
                        seed={reply.actor_user_id ?? reply.actor_agent_key ?? reply.id}
                        profile={profile}
                        getAvatarColor={props.getAvatarColor}
                        getInitials={props.getInitials}
                      />
                      <div className="community-interaction-reply-content">
                        <div className="community-interaction-meta-row">
                          <span className="community-interaction-author">{label}</span>
                          {badge ? <span className="community-interaction-badge">{badge}</span> : null}
                          <span>{props.formatChatTime(reply.created_at)}</span>
                        </div>
                        {reply.target_reply_id ? (
                          <QuoteChip quoted={replyById.get(reply.target_reply_id)} displayName={props.displayName} />
                        ) : null}
                        {isEditingReply ? (
                          <EditForm
                            value={editText}
                            onChange={setEditText}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                          />
                        ) : (
                          <>
                            <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                            <EmbedCards embeds={bundle.embeds} />
                            {reply.edited_at ? (
                              <span className="community-interaction-edited">(edited)</span>
                            ) : null}
                          </>
                        )}
                        <ReactionSummary
                          rows={reply.reaction_summary}
                          viewerEmojis={reply.viewer_emojis}
                          onToggle={(emoji) => props.onToggleReaction?.("reply", reply.id, emoji)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {props.drawerComposer ? (
            <div className="community-interaction-drawer-composer">{props.drawerComposer}</div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
