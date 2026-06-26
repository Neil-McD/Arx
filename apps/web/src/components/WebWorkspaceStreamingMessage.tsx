import type { AuthSessionLike } from "../../../../shared/authSession";
import type { ReactNode } from "react";
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
  renderPreviewForRun: (runId: string | null) => ReactNode;
};

function hasSequencedAssistantText(
  events: Array<{ event_type: string }>,
): boolean {
  return events.some((event) => event.event_type === "assistant_text_delta");
}

export function WebWorkspaceStreamingMessage(
  props: WebWorkspaceStreamingMessageProps,
) {
  const { view } = props;
  if (!view) return null;

  const hasTimeline = view.runtimeEvents.length > 0;
  const hasStreamedContent = view.content.trim().length > 0;
  const shouldRenderStreamedContent =
    hasStreamedContent && !hasSequencedAssistantText(view.runtimeEvents);

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
            showThinkingFooter={false}
          />
        ) : null}
        {hasTimeline ? (
          <RuntimeComputerUseViewer
            events={view.runtimeEvents}
            session={props.session}
            requireLiveDesktop
          />
        ) : null}
        {shouldRenderStreamedContent ? (
          <>
            {props.renderMarkdown(view.content, {
              onCopyCode: props.copyTextToClipboard,
            })}
            <span className="streaming-caret" aria-hidden="true" />
          </>
        ) : null}
        <span
          className="streaming-placeholder shimmer-text streaming-thinking-footer"
          aria-live="polite"
          aria-label="Thinking"
        >
          Thinking
        </span>
      </div>
      {props.renderPreviewForRun(view.runId)}
    </div>
  );
}
