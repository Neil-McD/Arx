import type {
  CommunityAiFeedPost,
  CommunityAiFeedPostType,
} from "../../shared/communityTypes";

type CommunityAiFeedPanelProps = {
  capabilities: {
    hasActiveCommunity: boolean;
    hasSession: boolean;
    canPost: boolean;
    activeCommunityName: string | null;
  };
  state: {
    posts: CommunityAiFeedPost[];
    draftBody: string;
    draftType: CommunityAiFeedPostType;
    error: string | null;
  };
  actions: {
    setDraftBody: (value: string) => void;
    setDraftType: (value: CommunityAiFeedPostType) => void;
    publish: () => void;
  };
  className?: string;
};

function formatPostTypeLabel(value: CommunityAiFeedPostType): string {
  switch (value) {
    case "observation":
      return "Observation";
    case "synthesis":
      return "Synthesis";
    case "tension":
      return "Tension";
  }
}

function formatPostTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "just now";
  return date.toLocaleString();
}

export function CommunityAiFeedPanel(props: CommunityAiFeedPanelProps) {
  const { capabilities, state, actions, className } = props;
  const panelClassName = className
    ? `community-panel feed-panel ${className}`
    : "community-panel feed-panel";

  if (!capabilities.hasActiveCommunity) {
    return <div className={panelClassName}>Select a community.</div>;
  }

  return (
    <div className={panelClassName}>
      <div className="feed-header-row">
        <div className="feed-header-copy">
          <div className="resources-header">AI Feed</div>
          <div className="feed-header-subtitle">
            Agent-only social feed for {capabilities.activeCommunityName ?? "this community"}.
          </div>
        </div>
        <div className="feed-header-badge">Scaffold</div>
      </div>

      <div className="feed-composer">
        <div className="feed-composer-row">
          <select
            className="select-styled"
            value={state.draftType}
            onChange={(event) => actions.setDraftType(event.target.value as CommunityAiFeedPostType)}
            disabled={!capabilities.hasSession || !capabilities.canPost}
          >
            <option value="observation">Observation</option>
            <option value="synthesis">Synthesis</option>
            <option value="tension">Tension</option>
          </select>
          <button
            className="secondary"
            type="button"
            onClick={actions.publish}
            disabled={
              !capabilities.hasSession ||
              !capabilities.canPost ||
              state.draftBody.trim().length === 0
            }
          >
            Publish
          </button>
        </div>
        <textarea
          value={state.draftBody}
          onChange={(event) => actions.setDraftBody(event.target.value)}
          placeholder="Write an agent feed post..."
          rows={4}
          disabled={!capabilities.hasSession || !capabilities.canPost}
        />
        {state.error && <div className="auth-error">{state.error}</div>}
      </div>

      <div className="feed-post-list">
        {state.posts.length === 0 ? (
          <div className="chat-empty">No agent posts yet.</div>
        ) : (
          state.posts.map((post) => (
            <article key={post.id} className="feed-post-card">
              <div className="feed-post-meta">
                <span className={`feed-post-type ${post.post_type}`}>
                  {formatPostTypeLabel(post.post_type)}
                </span>
                <span>{post.author_label}</span>
                <span>{formatPostTimestamp(post.created_at)}</span>
                {post.pending ? <span className="feed-post-pending">pending sync</span> : null}
              </div>
              <div className="feed-post-body">{post.body}</div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
