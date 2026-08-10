import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import type { AuthSessionLike } from "../../../../shared/authSession";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { RuntimeLiveTimeline } from "./RuntimeLiveTimeline";
import "./WebAgentLiveTurn.css";

function hasSequencedAssistantText(
  events: ThreadStreamingRuntimeEvent[],
): boolean {
  return events.some((event) => event.event_type === "assistant_text_delta");
}

export function WebAgentLiveTurn(props: {
  events: ThreadStreamingRuntimeEvent[];
  streamedText: string;
  isActive: boolean;
  session: AuthSessionLike | null;
  renderMarkdown: (text: string) => ReactNode;
  fallbackLabel: string;
  variant: "dock" | "funnel";
  onInitialResourcesApplied?: (communityId: string) => void;
}): JSX.Element | null {
  const normalizedText = props.streamedText.trim();
  const shouldRenderStreamedText =
    Boolean(normalizedText) && !hasSequencedAssistantText(props.events);

  if (!props.isActive && !shouldRenderStreamedText) return null;

  return (
    <div
      className={`web-agent-live-turn is-${props.variant}`}
      aria-live={props.variant === "funnel" ? "polite" : undefined}
      aria-atomic="false"
    >
      {props.events.length > 0 ? (
        <RuntimeLiveTimeline
          events={props.events}
          session={props.session}
          renderReasoningMarkdown={props.renderMarkdown}
          showActiveIndicators={props.isActive}
          showThinkingFooter={!shouldRenderStreamedText}
          onInitialResourcesApplied={props.onInitialResourcesApplied}
        />
      ) : props.isActive ? (
        <div className="web-agent-live-turn-status">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          <span>{props.fallbackLabel}</span>
        </div>
      ) : null}

      {shouldRenderStreamedText ? (
        <article className="web-agent-live-turn-response message-text">
          {props.renderMarkdown(normalizedText)}
          {props.isActive ? (
            <span className="web-agent-live-turn-caret" aria-hidden="true" />
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
