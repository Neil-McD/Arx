import type { ReactNode } from "react";
import { MessageSquare, PanelRightClose, RefreshCw } from "lucide-react";
import type {
  CommunityInteractionContentBlock,
  CommunityInteractionReplyBundle,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";

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

function kindLabel(kind: string): string {
  if (kind === "resource_share") return "Resource";
  if (kind === "agent_signal") return "Agent signal";
  return kind
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "Discussion";
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

function ActorAvatar(props: {
  label: string;
  seed: string;
  getAvatarColor: (seed: string) => string;
  getInitials: (value: string) => string;
}) {
  return (
    <div
      className="community-interaction-avatar"
      style={{ background: props.getAvatarColor(props.seed || props.label) }}
      aria-hidden="true"
    >
      {props.getInitials(props.label)}
    </div>
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
  const selectedRoot = props.selectedRootId
    ? props.roots.find((bundle) => bundle.root.id === props.selectedRootId) ?? null
    : null;
  const selectedRootLabel = selectedRoot
    ? actorLabel(selectedRoot.root, props.displayName)
    : "";
  const selectedRootText = selectedRoot
    ? bundleText(selectedRoot.content_blocks, selectedRoot.root.content_summary)
    : "";
  const canReplyToSelectedRoot = Boolean(
    selectedRoot?.root.legacy_message_id && selectedRoot.root.actor_user_id && selectedRootText.trim(),
  );

  return (
    <div className={`community-interaction-projection${selectedRoot ? " has-drawer" : ""}`}>
      <div className="community-interaction-main">
        <div className="community-interaction-feed-scroll">
          <div className="community-interaction-feed-header">
            <div>
              <div className="community-interaction-feed-title">{props.activeCommunityName}</div>
              <div className="community-interaction-feed-subtitle">Threads</div>
            </div>
            <button
              className="community-interaction-icon-button"
              type="button"
              onClick={props.onRetryRoots}
              disabled={props.isLoadingRoots}
              aria-label="Refresh threads"
              title="Refresh threads"
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>

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
            <div className="community-interaction-root-list">
              {props.roots.map((bundle) => {
                const root = bundle.root;
                const label = actorLabel(root, props.displayName);
                const body = bundleText(bundle.content_blocks, root.content_summary);
                const selected = root.id === props.selectedRootId;
                return (
                  <button
                    key={root.id}
                    type="button"
                    className={`community-interaction-root${selected ? " selected" : ""}`}
                    onClick={() => props.onSelectRoot(root.id)}
                    aria-pressed={selected}
                  >
                    <ActorAvatar
                      label={label}
                      seed={root.actor_user_id ?? root.actor_agent_key ?? root.id}
                      getAvatarColor={props.getAvatarColor}
                      getInitials={props.getInitials}
                    />
                    <div className="community-interaction-root-content">
                      <div className="community-interaction-meta-row">
                        <span className="community-interaction-author">{label}</span>
                        <span>{props.formatChatTime(root.created_at)}</span>
                        <span>{kindLabel(root.kind)}</span>
                      </div>
                      {root.title ? (
                        <div className="community-interaction-title">{root.title}</div>
                      ) : null}
                      <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
                      <div className="community-interaction-footer">
                        <span>{root.reply_count === 1 ? "1 reply" : `${root.reply_count} replies`}</span>
                        <ReactionSummary rows={root.reaction_summary} />
                      </div>
                    </div>
                  </button>
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
            <div>
              <div className="community-interaction-drawer-title">Replies</div>
              <div className="community-interaction-drawer-subtitle">{selectedRootLabel}</div>
            </div>
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
              <InteractionBody text={selectedRootText} renderTextWithLinks={props.renderTextWithLinks} />
              {canReplyToSelectedRoot ? (
                <button
                  className="community-interaction-reply-button"
                  type="button"
                  onClick={() => {
                    if (!selectedRoot?.root.legacy_message_id || !selectedRoot.root.actor_user_id) return;
                    props.onStartRootReply?.({
                      id: selectedRoot.root.legacy_message_id,
                      sender_id: selectedRoot.root.actor_user_id,
                      body: selectedRootText,
                      interaction_root_id: selectedRoot.root.id,
                    });
                  }}
                >
                  Reply
                </button>
              ) : null}
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
                  const body = bundleText(bundle.content_blocks, reply.content_summary);
                  return (
                    <div key={reply.id} className="community-interaction-reply">
                      <ActorAvatar
                        label={label}
                        seed={reply.actor_user_id ?? reply.actor_agent_key ?? reply.id}
                        getAvatarColor={props.getAvatarColor}
                        getInitials={props.getInitials}
                      />
                      <div className="community-interaction-reply-content">
                        <div className="community-interaction-meta-row">
                          <span className="community-interaction-author">{label}</span>
                          <span>{props.formatChatTime(reply.created_at)}</span>
                        </div>
                        <InteractionBody text={body} renderTextWithLinks={props.renderTextWithLinks} />
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
