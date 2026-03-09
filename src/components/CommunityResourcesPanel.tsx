import { formatChatTime } from "../../shared/contentFormatting";
import { parseEmbedUrl } from "../../shared/linkEmbedUi";
import type {
  CommunityResourcesActions,
  CommunityResourcesCapabilities,
  CommunityResourcesState,
} from "./communityResourcesContracts";

type CommunityResourcesPanelProps = {
  capabilities: CommunityResourcesCapabilities;
  state: CommunityResourcesState;
  actions: CommunityResourcesActions;
};

export function CommunityResourcesPanel(props: CommunityResourcesPanelProps) {
  const { capabilities, state, actions } = props;
  return (
    <div className="community-panel resources-panel">
      <div className="resources-header-row">
        <div className="resources-header">Resources</div>
        {capabilities.hasActiveCommunity && capabilities.canOperateResources && (
          <button className="resources-add-btn" onClick={actions.openNewResourceModal} title="Add resource">
            +
          </button>
        )}
      </div>
      {state.resourceSuccess && (
        <div className="success-toast">Resource saved successfully!</div>
      )}
      <div
        className={
          !state.isLoadingResources && state.resources.length === 0
            ? "resource-list resource-list-empty"
            : "resource-list"
        }
      >
        {state.isLoadingResources && (
          <div className="chat-loading">
            <div className="loading-spinner" />
            <span>Loading resources...</span>
          </div>
        )}
        {!state.isLoadingResources && state.resources.length === 0 && (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L10 5" />
                <path d="M14 11a5 5 0 0 0-7.07 0L3.4 14.54a5 5 0 0 0 7.07 7.07L14 19" />
              </svg>
            </div>
            <div className="chat-empty-title">
              Welcome to {capabilities.activeCommunityName ?? "your"} resources
            </div>
            <div className="chat-empty-text">
              {capabilities.canOperateResources
                ? "Share links, posts, and videos with your members. Add your first resource to get started."
                : "Resources shared by the moderators will show up here."}
            </div>
          </div>
        )}
        {!state.isLoadingResources && state.resources.map((resource) => {
          const embedInfo = resource.url ? parseEmbedUrl(resource.url) : null;
          const isEmbedOpen = state.openResourceEmbedId === resource.id;
          const metaLabel = embedInfo
            ? `embed • ${embedInfo.provider}`
            : resource.url
              ? "link"
              : "post";
          return (
            <div key={resource.id} className="resource-item">
              <div className="resource-title">
                {resource.pinned && <span className="resource-pin-tag">Pinned</span>}
                {resource.title}
              </div>
              <div className="resource-meta">
                <span>{metaLabel}</span>
                <span>{formatChatTime(resource.created_at)}</span>
              </div>
              {embedInfo && resource.url && (
                <div className="resource-embed">
                  {isEmbedOpen ? (
                    <div className="resource-embed-thumb open">
                      <button
                        type="button"
                        className="resource-embed-close"
                        onClick={() => actions.setOpenResourceEmbedId(null)}
                        title="Hide preview"
                      >
                        ×
                      </button>
                      <iframe
                        src={embedInfo.src}
                        title={`${resource.title} embed`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        loading="lazy"
                      />
                    </div>
                  ) : embedInfo.provider === "youtube" ? (
                    <button
                      type="button"
                      className="resource-embed-thumb"
                      onClick={() => actions.setOpenResourceEmbedId(resource.id)}
                      title="Preview"
                    >
                      <img src={embedInfo.thumbnailUrl} alt="YouTube thumbnail" loading="lazy" />
                      <div className="resource-embed-play">▶</div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="resource-embed-thumb placeholder"
                      onClick={() => actions.setOpenResourceEmbedId(resource.id)}
                      title="Preview"
                    >
                      <div className="resource-embed-provider">
                        {embedInfo.provider === "wistia" ? "Wistia" : "Embed"}
                      </div>
                      <div className="resource-embed-play">▶</div>
                    </button>
                  )}
                </div>
              )}
              {!embedInfo && resource.url && (
                <a className="resource-link" href={resource.url} target="_blank" rel="noreferrer">
                  {resource.url}
                </a>
              )}
              {resource.body_md && (
                <div className="resource-body">{resource.body_md}</div>
              )}
              {capabilities.canOperateResources && (
                <div className="resource-actions">
                  <button
                    className="secondary"
                    onClick={() => actions.handleEditResource(resource)}
                  >
                    Edit
                  </button>
                  <button
                    className="danger"
                    onClick={() => void actions.handleDeleteResource(resource.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
