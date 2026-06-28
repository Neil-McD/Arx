import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, CornerUpLeft, MessageSquare, PanelRightClose } from "lucide-react";
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
};

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

function ReactionSummary(props: {
  rows: Array<{ emoji: string; count: number }>;
}) {
  if (props.rows.length === 0) return null;
  return (
    <div className="community-interaction-reactions" aria-label="Reactions">
      {props.rows.map((row) => (
        <span key={row.emoji} className="community-interaction-reaction">
          <span>{row.emoji}</span>
          <span>{row.count}</span>
        </span>
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

function ActorAvatar(props: {
  label: string;
  seed: string;
  profile?: UserProfile | null;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
}) {
  return (
    <UserAvatar
      className="community-interaction-avatar"
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (props.roots.length !== prevRootCount.current) {
      el.scrollTop = el.scrollHeight;
      prevRootCount.current = props.roots.length;
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
                        return (
                          <div
                            key={root.id}
                            className={`community-interaction-message${selected ? " selected" : ""}`}
                          >
                            {root.title ? <div className="community-interaction-title">{root.title}</div> : null}
                            <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                            <EmbedCards embeds={bundle.embeds} />
                            {hasFooter ? (
                              <div className="community-interaction-footer">
                                {root.reply_count > 0 ? (
                                  <button
                                    type="button"
                                    className="community-interaction-reply-pill"
                                    onClick={() => props.onSelectRoot(root.id)}
                                  >
                                    {root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}
                                  </button>
                                ) : null}
                                <ReactionSummary rows={root.reaction_summary} />
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
          <div className="community-interaction-drawer-controls">
            <button
              className="community-interaction-back-button"
              type="button"
              onClick={props.onCloseDrawer}
              aria-label="Back to chat"
              title="Back to chat"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button
              className="community-interaction-icon-button"
              type="button"
              onClick={props.onCloseDrawer}
              aria-label="Close replies"
              title="Close replies"
            >
              <PanelRightClose size={16} aria-hidden="true" />
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
                  {selectedRoot.root.reaction_summary.length > 0 ? (
                    <div className="community-interaction-thread-anchor-actions">
                      <ReactionSummary rows={selectedRoot.root.reaction_summary} />
                    </div>
                  ) : null}
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
                  return (
                    <div key={reply.id} className="community-interaction-reply">
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
                        <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                        <EmbedCards embeds={bundle.embeds} />
                        <ReactionSummary rows={reply.reaction_summary} />
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
