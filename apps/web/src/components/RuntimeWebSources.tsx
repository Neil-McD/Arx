import { useMemo } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import {
  finishProductLatencyTrace,
  startProductLatencyTrace,
} from "../../../../shared/productLatencyTrace";
import { extractRuntimeWebSources } from "../../../../shared/runtimeTimelineUi";

export function RuntimeWebSources(props: {
  events: ThreadStreamingRuntimeEvent[];
}): JSX.Element | null {
  const sources = useMemo(() => {
    const trace = startProductLatencyTrace("runtime.web_sources_build", {
      eventCount: props.events.length,
    });
    const next = extractRuntimeWebSources(props.events as any);
    finishProductLatencyTrace(
      trace,
      "ok",
      {
        eventCount: props.events.length,
        sourceCount: next.length,
      },
      { minDurationMs: 2 },
    );
    return next;
  }, [props.events]);
  if (sources.length === 0) return null;

  return (
    <div className="message-citations" role="list" aria-label="Web sources used">
      {sources.map((source) => (
        <a
          key={source.id}
          className="message-citation-chip message-web-source-chip"
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          role="listitem"
          title={source.url}
        >
          <span className="message-citation-kind">{source.host}</span>
          <span className="message-citation-text">{source.label}</span>
        </a>
      ))}
    </div>
  );
}
