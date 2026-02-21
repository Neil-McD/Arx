import { renderMarkdown } from "../../shared/markdownUi";
import { copyTextToClipboard } from "../../shared/chatUi";
import { formatChatTime } from "../../shared/contentFormatting";
import type {
  CommunityLibraryActions,
  CommunityLibraryCapabilities,
  CommunityLibraryState,
} from "./communityLibraryContracts";

type CommunityLibraryPanelProps = {
  capabilities: CommunityLibraryCapabilities;
  state: CommunityLibraryState;
  actions: CommunityLibraryActions;
};

export function CommunityLibraryPanel(props: CommunityLibraryPanelProps) {
  const { capabilities, state, actions } = props;
  if (!capabilities.hasActiveCommunity) {
    return <div className="community-panel library-panel">Select a community.</div>;
  }

  return (
    <div className="community-panel library-panel">
      {state.isLoadingResources ? (
        <div className="chat-loading">
          <div className="loading-spinner" />
          <span>Loading library...</span>
        </div>
      ) : state.libraryResources.length === 0 ? (
        <div className="chat-empty-state">
          <div className="chat-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23" />
              <path d="M4 5.5V19.5" />
            </svg>
          </div>
          <div className="chat-empty-title">Welcome to the library</div>
          <div className="chat-empty-text">Pin resources to add them here.</div>
        </div>
      ) : (
        <div className="library-layout">
          <div className="library-column">
            <div className="resources-header">Library</div>
            <div className="library-list">
              {state.libraryResources.map((resource) => (
                <button
                  key={resource.id}
                  className={resource.id === state.selectedLibraryResourceId ? "library-item active" : "library-item"}
                  onClick={() => actions.setSelectedLibraryResourceId(resource.id)}
                >
                  <div className="library-item-title">{resource.title}</div>
                  <div className="library-item-meta">
                    <span>{resource.type}</span>
                    <span>{formatChatTime(resource.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="library-column">
            <div className="resources-header">Preview</div>
            <div className="library-versions">
              {!state.selectedLibraryResource && <div className="chat-empty">Select a library item.</div>}
              {state.selectedLibraryResource && (
                <div className="library-version">
                  <div className="library-version-meta">
                    <span>{formatChatTime(state.selectedLibraryResource.created_at)}</span>
                    <span>{state.selectedLibraryResource.url ? "link" : state.selectedLibraryResource.type}</span>
                  </div>
                  {state.selectedLibraryResource.url && (
                    <div className="resource-body">
                      <a href={state.selectedLibraryResource.url} target="_blank" rel="noreferrer">
                        {state.selectedLibraryResource.url}
                      </a>
                    </div>
                  )}
                  <div className="library-version-body">
                    {state.selectedLibraryResource.body_md ? (
                      renderMarkdown(state.selectedLibraryResource.body_md, {
                        onCopyCode: copyTextToClipboard,
                      })
                    ) : (
                      <div className="chat-empty">No content.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
