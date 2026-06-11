import type { AuthSessionLike } from "../../../../shared/authSession";
import { RuntimeComputerUseViewer } from "./RuntimeComputerUseViewer";
import { RuntimeLiveTimeline } from "./RuntimeLiveTimeline";
import type {
  WorkspaceMarkdownRenderer,
  WorkspaceStreamingMessageView,
} from "./webWorkspaceThreadViews";

type WebWorkspaceStreamingMessageProps = {
  view: WorkspaceStreamingMessageView | null;
  session: AuthSessionLike | null;
  renderMarkdown: WorkspaceMarkdownRenderer;
  copyTextToClipboard: (text: string) => Promise<void> | void;
};

export function WebWorkspaceStreamingMessage(
  props: WebWorkspaceStreamingMessageProps,
) {
  const { view } = props;
  if (!view) return null;

  const hasTimeline = view.runtimeEvents.length > 0;
  const hasStreamedContent = view.content.trim().length > 0;

  return (
    <div className="message-item assistant streaming thinking">
      <div className="message-text">
        {hasTimeline ? (
          <RuntimeLiveTimeline
            events={view.runtimeEvents}
            session={props.session}
            renderReasoningMarkdown={(text) =>
              props.renderMarkdown(text, {
                onCopyCode: props.copyTextToClipboard,
              })
            }
            showActiveIndicators
          />
        ) : null}
        {hasTimeline ? (
          <RuntimeComputerUseViewer
            events={view.runtimeEvents}
            session={props.session}
            requireLiveDesktop
          />
        ) : null}
        {hasStreamedContent ? (
          <>
            {props.renderMarkdown(view.content, {
              onCopyCode: props.copyTextToClipboard,
            })}
            <span className="streaming-caret" aria-hidden="true" />
          </>
        ) : null}
        {!hasTimeline ? (
          <span
            className="streaming-placeholder shimmer-text streaming-thinking-footer"
            aria-live="polite"
            aria-label="Thinking"
          >
            Thinking
          </span>
        ) : null}
      </div>
    </div>
  );
}
