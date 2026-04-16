import { useMemo, type ReactNode } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { buildRuntimeLiveTimeline } from "../../../../shared/runtimeTimelineUi";
import { useSmoothStreamingText } from "../../../../shared/useSmoothStreamingText";

function splitTraceLinkTitle(title: string): { prefix: string | null; linkText: string } {
  const separatorIndex = title.indexOf(": ");
  if (separatorIndex < 0) {
    return { prefix: null, linkText: title };
  }
  return {
    prefix: title.slice(0, separatorIndex + 1),
    linkText: title.slice(separatorIndex + 2),
  };
}

function RuntimeReasoningEntry(props: {
  id: string;
  isActive: boolean;
  text: string;
  renderReasoningMarkdown: (text: string) => ReactNode;
  showActiveIndicators: boolean;
}): JSX.Element {
  const displayText = useSmoothStreamingText(props.text, {
    active: props.showActiveIndicators && props.isActive,
  });

  return (
    <div
      className={`runtime-live-timeline-entry runtime-live-timeline-reasoning${props.showActiveIndicators && props.isActive ? " active" : ""}`}
    >
      <div className="message-text runtime-live-timeline-reasoning-text">
        {props.renderReasoningMarkdown(displayText)}
        {props.showActiveIndicators && props.isActive ? <span className="streaming-caret" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

export function RuntimeLiveTimeline(props: {
  events: ThreadStreamingRuntimeEvent[];
  renderReasoningMarkdown: (text: string) => ReactNode;
  showActiveIndicators?: boolean;
}): JSX.Element | null {
  const entries = useMemo(() => buildRuntimeLiveTimeline(props.events as any), [props.events]);
  if (entries.length === 0) return null;
  const showActiveIndicators = props.showActiveIndicators ?? false;

  return (
    <div className="runtime-live-timeline">
      {entries.map((entry) =>
        entry.kind === "reasoning" ? (
          <RuntimeReasoningEntry
            key={entry.id}
            id={entry.id}
            isActive={entry.isActive}
            text={entry.text}
            renderReasoningMarkdown={props.renderReasoningMarkdown}
            showActiveIndicators={showActiveIndicators}
          />
        ) : (
          <details
            key={entry.id}
            className={`runtime-live-timeline-entry runtime-tool-trace${showActiveIndicators && entry.isActive ? " active" : ""}`}
          >
            <summary className="runtime-tool-trace-summary">
              <span className="runtime-tool-trace-toggle">
                {entry.group.title}
                {entry.group.status === "running" ? (
                  <>
                    <span className="runtime-tool-trace-active-detail">
                      {entry.group.calls[entry.group.calls.length - 1]?.title ?? "Working"}
                    </span>
                    {showActiveIndicators && entry.isActive ? <span className="streaming-caret" aria-hidden="true" /> : null}
                  </>
                ) : null}
              </span>
            </summary>
            <div className="runtime-tool-trace-stack">
              {entry.group.calls.map((call) => (
                <div key={call.id} className="runtime-tool-trace-item">
                  <div className="runtime-tool-trace-item-row static">
                    <span className="runtime-tool-trace-copy">
                      {call.href ? (
                        (() => {
                          const { prefix, linkText } = splitTraceLinkTitle(call.title);
                          return (
                            <>
                              {prefix ? <span className="runtime-tool-trace-title">{prefix} </span> : null}
                              <a
                                className="runtime-tool-trace-title runtime-tool-trace-link"
                                href={call.href}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={call.href}
                              >
                                {linkText}
                              </a>
                            </>
                          );
                        })()
                      ) : (
                        <span className="runtime-tool-trace-title">{call.title}</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ),
      )}
    </div>
  );
}
