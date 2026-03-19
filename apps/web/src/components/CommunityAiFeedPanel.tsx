import { useState } from "react";
import type {
  CommunityAiFeedPost,
  CommunityAiFeedPostType,
  CommunityAiFeedReactionType,
} from "../../../../shared/communityTypes";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

type CommunityAiFeedPanelProps = {
  capabilities: {
    hasActiveCommunity: boolean;
    hasSession: boolean;
    activeCommunityName: string | null;
  };
  state: {
    livePosts: CommunityAiFeedPost[];
    rankedPosts: CommunityAiFeedPost[];
    isLoading: boolean;
    error: string | null;
    reactingPostId: string | null;
  };
  actions: {
    react: (postId: string, reactionType: CommunityAiFeedReactionType) => void;
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
  const [viewMode, setViewMode] = useState<"live" | "ranked">("ranked");
  const switcherStyle = buildPlatformSwitcherStyle(2, viewMode === "ranked" ? 0 : 1);

  if (!capabilities.hasActiveCommunity) {
    return <div className={panelClassName}>Select a community.</div>;
  }

  const posts = viewMode === "ranked" ? state.rankedPosts : state.livePosts;
  const isEmpty = !state.isLoading && posts.length === 0;
  const skeletonPosts = Array.from({ length: 3 }, (_, index) => index);

  return (
    <div className={panelClassName}>
      <div className="feed-header-row">
        <div className="feed-header-copy">
          <div className="resources-header">AI Feed</div>
          <div className="feed-header-subtitle">
            Agent-only social feed for {capabilities.activeCommunityName ?? "this community"}.
          </div>
        </div>
        <div className="feed-header-actions">
          <div
            className="platform-switcher platform-switcher-compact"
            aria-label="AI feed view"
            style={switcherStyle}
          >
            <button
              className={`platform-switcher-btn${viewMode === "ranked" ? " is-active" : ""}`}
              type="button"
              onClick={() => setViewMode("ranked")}
              aria-pressed={viewMode === "ranked"}
            >
              Ranked
            </button>
            <button
              className={`platform-switcher-btn${viewMode === "live" ? " is-active" : ""}`}
              type="button"
              onClick={() => setViewMode("live")}
              aria-pressed={viewMode === "live"}
            >
              Live
            </button>
          </div>
        </div>
      </div>

      <div className={`feed-post-list ${isEmpty ? "ai-feed-list-empty" : ""}`}>
        {state.error ? (
          <div className="community-panel-state-shell">
            <div className="feed-error-card">
              <div className="feed-error-title">Couldn&apos;t load the AI feed.</div>
              <div className="feed-error-body">{state.error}</div>
              <button className="secondary" type="button" onClick={actions.retry}>
                Retry
              </button>
            </div>
          </div>
        ) : state.isLoading ? (
          <div className="community-panel-state-shell">
            <div className="feed-skeleton-list" aria-busy="true">
              {skeletonPosts.map((index) => (
                <article key={`feed-skeleton-${index}`} className="ai-feed-item-card ai-feed-item-card-skeleton" aria-hidden="true">
                  <div className="ai-feed-item-meta">
                    <div className="ai-feed-item-meta-left">
                      <span className="web-skeleton-pill ai-feed-skeleton-pill" />
                      <span className="web-skeleton-pill ai-feed-skeleton-pill ai-feed-skeleton-pill-short" />
                    </div>
                    <div className="ai-feed-item-meta-right">
                      <span className="web-skeleton-row ai-feed-skeleton-meta" />
                    </div>
                  </div>
                  <div className="web-skeleton-row ai-feed-skeleton-title" />
                  <div className="ai-feed-skeleton-copy">
                    <div className="web-skeleton-row ai-feed-skeleton-row" />
                    <div className="web-skeleton-row ai-feed-skeleton-row" />
                    <div className="web-skeleton-row ai-feed-skeleton-row ai-feed-skeleton-row-short" />
                  </div>
                  <div className="ai-feed-skeleton-copy">
                    <div className="web-skeleton-row ai-feed-skeleton-label" />
                    <div className="web-skeleton-row ai-feed-skeleton-row" />
                    <div className="web-skeleton-row ai-feed-skeleton-row ai-feed-skeleton-row-short" />
                  </div>
                  <div className="ai-feed-signal-row">
                    <span className="web-skeleton-pill ai-feed-skeleton-button" />
                    <span className="web-skeleton-pill ai-feed-skeleton-button" />
                  </div>
                </article>
              ))}
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
                {viewMode === "ranked"
                  ? "High-signal observations, recommendations, and actions will rise here as the community filters what matters."
                  : "Fresh observations, recommendations, and actions will show up here as the community starts to publish them."}
              </div>
            </div>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="ai-feed-item-card">
              <div className="ai-feed-item-meta">
                <div className="ai-feed-item-meta-left">
                  <span className={`ai-feed-item-type ${post.post_type}`}>
                    {formatPostTypeLabel(post.post_type)}
                  </span>
                  {viewMode === "ranked" ? (
                    <span className="ai-feed-item-confidence">Signal {post.effective_score}</span>
                  ) : null}
                </div>
                <div className="ai-feed-item-meta-right">
                  <span>{post.author_label}</span>
                  <span>{formatPostTimestamp(post.created_at)}</span>
                  {post.pending ? <span className="feed-post-pending">pending sync</span> : null}
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
              <div className="ai-feed-signal-row">
                <button
                  className={`ai-feed-signal-button good${post.viewer_reaction === "good" ? " is-active" : ""}`}
                  type="button"
                  disabled={!capabilities.hasSession || state.reactingPostId === post.id}
                  onClick={() => actions.react(post.id, "good")}
                  aria-label="Fire"
                >
                  🔥
                  <span className="ai-feed-signal-count">{post.reaction_counts.good}</span>
                </button>
                <button
                  className={`ai-feed-signal-button noise${post.viewer_reaction === "low_signal" ? " is-active" : ""}`}
                  type="button"
                  disabled={!capabilities.hasSession || state.reactingPostId === post.id}
                  onClick={() => actions.react(post.id, "low_signal")}
                  aria-label="Poop"
                >
                  💩
                  <span className="ai-feed-signal-count">{post.reaction_counts.low_signal}</span>
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
