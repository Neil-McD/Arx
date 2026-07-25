import type {
  CommunityAiFeedPost,
  CommunityAiFeedPostType,
} from "../../../../shared/communityTypes";

type CommunityAiFeedPanelProps = {
  capabilities: {
    hasActiveCommunity: boolean;
    activeCommunityName: string | null;
    canModerateFeed: boolean;
  };
  state: {
    posts: CommunityAiFeedPost[];
    isLoading: boolean;
    error: string | null;
    moderatingPostId: string | null;
  };
  actions: {
    hidePost: (postId: string) => void;
    retry: () => void;
  };
  className?: string;
};

function formatPostTypeLabel(value: CommunityAiFeedPostType): string {
  switch (value) {
    case "observation":
      return "Observation";
    case "recommendation":
      return "Recommendation";
    case "action":
      return "Action";
  }
}

function formatPostTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "just now";
  return date.toLocaleString();
}

function hasEvidence(post: CommunityAiFeedPost): boolean {
  return Array.isArray(post.evidence) && post.evidence.length > 0;
}

export function CommunityAiFeedPanel(props: CommunityAiFeedPanelProps) {
  const { capabilities, state, actions, className } = props;
  const panelClassName = className
    ? `community-panel feed-panel ${className}`
    : "community-panel feed-panel";

  if (!capabilities.hasActiveCommunity) {
    return <div className={panelClassName}>Select a community.</div>;
  }

  const posts = state.posts;
  const hasAnyFeedContent = posts.length > 0;
  const showInitialFeedLoading = state.isLoading && !hasAnyFeedContent;
  const showBlockingFeedError = Boolean(state.error && !hasAnyFeedContent);
  const isEmpty = !showInitialFeedLoading && posts.length === 0;
  return (
    <div className={panelClassName}>
      <div className="feed-header-row">
        <div className="feed-header-copy">
          <div className="resources-header">AI Feed</div>
          <div className="feed-header-subtitle">
            Agent-only social feed for {capabilities.activeCommunityName ?? "this community"}.
          </div>
        </div>
      </div>

      {state.isLoading && !showInitialFeedLoading ? (
        <div className="analytics-refreshing-note">Refreshing AI feed...</div>
      ) : null}
      {state.error && !showBlockingFeedError ? (
        <div className="analytics-refreshing-note">AI feed refresh failed.</div>
      ) : null}

      <div className={`feed-post-list ${isEmpty ? "ai-feed-list-empty" : ""}`}>
        {showBlockingFeedError ? (
          <div className="community-panel-state-shell">
            <div className="feed-error-card">
              <div className="feed-error-title">Couldn&apos;t load the AI feed.</div>
              <div className="feed-error-body">{state.error}</div>
              <button className="secondary" type="button" onClick={actions.retry}>
                Retry
              </button>
            </div>
          </div>
        ) : showInitialFeedLoading ? (
          <div className="community-panel-state-shell">
            <div className="community-chat-page-loading-card" aria-busy="true" aria-live="polite">
              <div className="community-chat-page-loading-title">Loading AI feed…</div>
              <div className="community-chat-page-loading-copy">
                {`Preparing agent signal for ${capabilities.activeCommunityName ?? "this community"}.`}
              </div>
              <div className="community-chat-page-loading-progress web-skeleton-pill" aria-hidden="true" />
            </div>
          </div>
        ) : isEmpty ? (
          <div className="community-panel-state-shell">
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16" />
                  <path d="M4 12h12" />
                  <path d="M4 17h8" />
                  <circle cx="18" cy="17" r="2" />
                </svg>
              </div>
              <div className="chat-empty-title">
                Welcome to {capabilities.activeCommunityName ?? "your"} AI feed
              </div>
              <div className="chat-empty-text">
                Fresh observations, recommendations, and actions will show up here as the community agent publishes them.
              </div>
            </div>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} id={`community-ai-feed-${post.id}`} className="ai-feed-item-card">
              <div className="ai-feed-item-meta">
                <div className="ai-feed-item-meta-left">
                  <span className={`ai-feed-item-type ${post.post_type}`}>
                    {formatPostTypeLabel(post.post_type)}
                  </span>
                </div>
                <div className="ai-feed-item-meta-right">
                  <span>{post.author_label}</span>
                  <span>{formatPostTimestamp(post.created_at)}</span>
                  {post.pending ? <span className="feed-post-pending">pending sync</span> : null}
                  {capabilities.canModerateFeed ? (
                    <button
                      className="ai-feed-moderate-button"
                      type="button"
                      disabled={state.moderatingPostId === post.id}
                      onClick={() => actions.hidePost(post.id)}
                    >
                      {state.moderatingPostId === post.id ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              </div>
              {post.title ? <h3 className="ai-feed-item-title">{post.title}</h3> : null}
              <p className="ai-feed-item-summary">{post.body}</p>
              {hasEvidence(post) ? (
                <div className="ai-feed-item-section">
                  <div className="ai-feed-item-section-label">Evidence</div>
                  <ul className="ai-feed-item-section-body">
                    {post.evidence.map((entry, index) => (
                      <li key={`${post.id}:evidence:${index}`}>
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
