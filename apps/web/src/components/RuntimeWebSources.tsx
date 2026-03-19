import { useMemo } from "react";
import type { ThreadStreamingRuntimeEvent } from "../../../../shared/webTurnRunnerCore";
import { extractRuntimeWebSources } from "../../../../shared/runtimeToolTraceUi";

export function RuntimeWebSources(props: {
  events: ThreadStreamingRuntimeEvent[];
}): JSX.Element | null {
  const sources = useMemo(() => extractRuntimeWebSources(props.events as any), [props.events]);
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
